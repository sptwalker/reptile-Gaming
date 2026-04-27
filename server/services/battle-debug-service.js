/**
 * 战斗调试服务
 * - 用于测试模块实时战斗数值验证
 * - 调试会话使用内存推进，战斗报告会持久化到 battle_debug_report
 */

'use strict';

const crypto = require('crypto');
const { secureRandom } = require('../utils/random');
const { getDB } = require('../db');
const battleEngine = require('./battle-engine');
const rules = require('../models/game-rules');
const { buildAppearance } = require('./pet-appearance-service');

const sessions = new Map();
const MAX_SESSIONS = 20;
const SESSION_TTL_MS = 30 * 60 * 1000;

function _sessionId() {
    return `${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function _loadFighter(petId, sideName) {
    const id = Number(petId);
    if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, msg: `${sideName}宠物ID无效: ${petId || ''}` };
    }

    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ?').get(id);
    if (!pet) return { ok: false, msg: `${sideName}宠物不存在: ${id}` };

    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(id);
    if (!attr) return { ok: false, msg: `${sideName}宠物属性不存在: ${id}` };

    const skills = db.prepare('SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1').all(id);
    const appearance = buildAppearance(pet, attr);
    return {
        ok: true,
        fighter: {
            id: pet.id,
            name: pet.name,
            quality: pet.quality,
            level: pet.level,
            stage: pet.stage,
            stamina: pet.stamina,
            attr,
            skills,
        },
        appearance
    };
}

function _cleanup() {
    const now = Date.now();
    for (const [id, item] of sessions.entries()) {
        if (now - item.updatedAt > SESSION_TTL_MS) sessions.delete(id);
    }
    while (sessions.size > MAX_SESSIONS) {
        const first = sessions.keys().next().value;
        sessions.delete(first);
    }
}

function listMaps() {
    return { code: 0, data: { maps: rules.ARENA_MAPS, bodyParts: rules.BATTLE_BODY_PARTS, personalities: rules.BATTLE_PERSONALITY_PRESETS } };
}

function _randomPersonality() {
    const keys = Object.keys(rules.BATTLE_PERSONALITY_PRESETS || {}).filter(k => k !== 'balanced');
    return keys.length ? keys[secureRandom(0, keys.length - 1)] : 'balanced';
}

function _resolvePersonality(input, randomize) {
    if (randomize || input === 'random') return battleEngine.normalizePersonality(_randomPersonality());
    return battleEngine.normalizePersonality(input || 'balanced');
}

function _avgTrace(trace, total) {
    const out = {};
    for (const key of rules.AI_STATES) out[key] = Number(((trace[key] || 0) / Math.max(1, total)).toFixed(1));
    return out;
}

function _avgStrategy(trace, total) {
    const keys = ['pressure', 'execute', 'defend', 'kite', 'ambush', 'bait', 'observe', 'recover', 'fear', 'idle'];
    const out = {};
    for (const key of keys) out[key] = Number(((trace && trace[key] || 0) / Math.max(1, total)).toFixed(1));
    return out;
}

function _addStrategy(sum, trace) {
    if (!trace) return;
    for (const [key, value] of Object.entries(trace)) sum[key] = (sum[key] || 0) + (value || 0);
}

function _addKeyed(sum, src) {
    if (!src) return;
    for (const [key, value] of Object.entries(src)) sum[key] = (sum[key] || 0) + (Number(value) || 0);
}

function _avgKeyed(src, total) {
    const out = {};
    for (const [key, value] of Object.entries(src || {})) out[key] = Number(((Number(value) || 0) / Math.max(1, total)).toFixed(1));
    return out;
}

function _addTargetParts(sum, src) {
    if (!src) return;
    for (const [key, value] of Object.entries(src)) {
        if (!sum[key]) sum[key] = { attempts: 0, damage: 0 };
        sum[key].attempts += value && value.attempts || 0;
        sum[key].damage += value && value.damage || 0;
    }
}

function _avgTargetParts(src, total) {
    const out = {};
    for (const [key, value] of Object.entries(src || {})) {
        out[key] = {
            avgAttempts: Number(((value.attempts || 0) / Math.max(1, total)).toFixed(1)),
            avgDamage: Number(((value.damage || 0) / Math.max(1, total)).toFixed(1)),
        };
    }
    return out;
}

function _addInfoStats(sum, src) {
    if (!src) return;
    for (const key of ['heard', 'fakeHeard', 'misled', 'infoSkills']) sum[key] = (sum[key] || 0) + (src[key] || 0);
}

function _addOpponentModel(sum, src) {
    if (!src) return;
    for (const key of ['actions', 'skills', 'attacks', 'defenses', 'movement', 'tricks', 'perceptions', 'aggression', 'defense', 'mobility', 'deception', 'observation']) {
        sum[key] = (sum[key] || 0) + (src[key] || 0);
    }
    sum.lastIntent = src.lastIntent || sum.lastIntent || 'idle';
    sum.lastSkill = src.lastSkill || sum.lastSkill || null;
    if (!sum.intentTrace) sum.intentTrace = {};
    _addStrategy(sum.intentTrace, src.intentTrace);
}

function _addTrace(sum, trace) {
    for (const key of rules.AI_STATES) sum[key] = (sum[key] || 0) + (trace && trace[key] || 0);
}

function _emptyAngleStats() {
    return { front: 0, side: 0, rear: 0, total: 0, flankScoreSum: 0, rearDamage: 0 };
}

function _addAngleStats(sum, angle) {
    if (!angle) return;
    sum.front += angle.front || 0;
    sum.side += angle.side || 0;
    sum.rear += angle.rear || 0;
    sum.total += angle.total || 0;
    sum.flankScoreSum += angle.flankScoreSum || 0;
    sum.rearDamage += angle.rearDamage || 0;
}

function _angleReport(angle) {
    const total = Math.max(1, angle && angle.total || 0);
    return {
        front: angle.front || 0,
        side: angle.side || 0,
        rear: angle.rear || 0,
        total: angle.total || 0,
        frontRate: _rate(angle.front || 0, total),
        sideRate: _rate(angle.side || 0, total),
        rearRate: _rate(angle.rear || 0, total),
        avgFlankScore: Number(((angle.flankScoreSum || 0) / total).toFixed(3)),
        rearDamage: angle.rearDamage || 0
    };
}

function _rate(v, total) {
    return Number((v / Math.max(1, total) * 100).toFixed(1));
}

function _safeJson(value) {
    return JSON.stringify(value == null ? null : value);
}

function _compressFrames(frames) {
    if (!Array.isArray(frames) || frames.length === 0) return [];
    const result = [frames[0]];
    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1];
        const curr = frames[i];
        const delta = { f: curr.f };
        const da = {};
        for (const k of Object.keys(curr.a || {})) {
            if (curr.a[k] !== (prev.a || {})[k]) da[k] = curr.a[k];
        }
        if (Object.keys(da).length > 0) delta.a = da;
        const db = {};
        for (const k of Object.keys(curr.b || {})) {
            if (curr.b[k] !== (prev.b || {})[k]) db[k] = curr.b[k];
        }
        if (Object.keys(db).length > 0) delta.b = db;
        if (curr.ev && curr.ev.length > 0) delta.ev = curr.ev;
        result.push(delta);
    }
    return result;
}

function _countEvents(frames) {
    return (frames || []).reduce((sum, frame) => sum + (Array.isArray(frame.ev) ? frame.ev.length : 0), 0);
}

function _topKey(obj) {
    let best = null;
    let bestValue = -Infinity;
    for (const [key, value] of Object.entries(obj || {})) {
        const n = Number(value) || 0;
        if (n > bestValue) {
            best = key;
            bestValue = n;
        }
    }
    return { key: best || 'none', value: bestValue > -Infinity ? bestValue : 0 };
}

function _topTargetPart(parts) {
    let best = null;
    let bestAttempts = -Infinity;
    for (const [key, value] of Object.entries(parts || {})) {
        const attempts = Number(value && value.attempts || 0);
        if (attempts > bestAttempts) {
            best = key;
            bestAttempts = attempts;
        }
    }
    return { key: best || 'none', attempts: bestAttempts > -Infinity ? bestAttempts : 0 };
}

function _sideAnalysis(side, opponent, totalFrames) {
    const hits = Number(side && side.hits || 0);
    const skills = Number(side && side.skillsUsed || 0);
    const totalDamage = Number(side && side.totalDamage || 0);
    const crits = Number(side && side.crits || 0);
    const dodges = Number(side && side.dodges || 0);
    const blocks = Number(side && side.blocks || 0);
    const economy = side && side.actionEconomy || {};
    const angle = side && side.angle || {};
    const topAi = _topKey(side && side.personalityTrace);
    const topStrategy = _topKey(side && (side.strategyTrace || side.strategy));
    const topTarget = _topTargetPart(side && side.targetParts);
    const frames = Math.max(1, Number(totalFrames || 0));
    return {
        petId: side && side.petId || 0,
        name: side && side.name || '',
        hpRemaining: side && side.hpRemaining || 0,
        hpMax: side && side.hpMax || 0,
        damage: totalDamage,
        damagePerSecond: Number((totalDamage / Math.max(1, Math.ceil(frames / rules.BATTLE_FPS))).toFixed(1)),
        damageShare: _rate(totalDamage, totalDamage + Number(opponent && opponent.totalDamage || 0)),
        hitRate: _rate(hits, Math.max(1, skills)),
        critRate: _rate(crits, Math.max(1, hits)),
        dodgePerSkill: Number((dodges / Math.max(1, skills)).toFixed(2)),
        blockRate: _rate(blocks, Math.max(1, hits + blocks)),
        skillsUsed: skills,
        staminaSpent: Number(economy.spent || 0),
        staminaRecovered: Number(economy.recovered || 0),
        staminaBlocked: Number(economy.blockedByStamina || 0),
        dominantAiState: topAi,
        dominantStrategy: topStrategy,
        topTargetPart: topTarget,
        infoStats: side && side.infoStats || {},
        opponentModel: side && side.opponentModel || {},
        angle: {
            frontRate: _rate(angle.front || 0, angle.total || 0),
            sideRate: _rate(angle.side || 0, angle.total || 0),
            rearRate: _rate(angle.rear || 0, angle.total || 0),
            rearDamage: angle.rearDamage || 0,
        },
    };
}

function _buildDebugAnalysis(summary, status) {
    const totalFrames = Number(summary && summary.totalFrames || 0);
    const duration = Number(summary && summary.duration || Math.ceil(totalFrames / rules.BATTLE_FPS) || 0);
    const left = summary && summary.left || {};
    const right = summary && summary.right || {};
    const leftReport = _sideAnalysis(left, right, totalFrames);
    const rightReport = _sideAnalysis(right, left, totalFrames);
    const warnings = [];
    const suggestions = [];
    const damageDelta = Math.abs(leftReport.damage - rightReport.damage);
    const damageTotal = Math.max(1, leftReport.damage + rightReport.damage);

    if (duration < 10) warnings.push('战斗时长偏短，可能存在爆发过高或生存过低。');
    if (duration > 90) warnings.push('战斗时长偏长，可能存在伤害不足或恢复/防御收益过高。');
    if (damageDelta / damageTotal > 0.45) warnings.push('双方伤害差距较大，建议复查属性、技能倍率或AI策略收益。');
    for (const [label, side] of [['左方', leftReport], ['右方', rightReport]]) {
        if (side.skillsUsed > 0 && side.hitRate < 35) warnings.push(`${label}命中率偏低，可能导致战斗体验拖沓。`);
        if (side.critRate > 45) warnings.push(`${label}暴击率偏高，爆发稳定性可能过强。`);
        if (side.staminaBlocked > Math.max(3, side.skillsUsed * 0.2)) warnings.push(`${label}体力不足阻塞较多，行动经济可能过紧。`);
        if (side.dominantStrategy.value > totalFrames * 0.7) warnings.push(`${label}策略意图过度集中于 ${side.dominantStrategy.key}，AI多样性不足。`);
        if ((side.infoStats.misled || 0) > (side.infoStats.heard || 0) * 0.6) warnings.push(`${label}被假声误导比例偏高，信息博弈惩罚可能过重。`);
    }
    if (leftReport.angle.rearRate < 5 && rightReport.angle.rearRate < 5) suggestions.push('绕后命中占比很低，可检查机动/伏击策略权重与地图空间。');
    if (leftReport.staminaBlocked || rightReport.staminaBlocked) suggestions.push('可对高消耗技能加入更强的体力阈值判断，减少无效尝试。');
    if (warnings.length === 0) suggestions.push('本场未发现明显异常，可结合批量测试继续观察胜率、时长和策略分布。');

    return {
        status,
        winner: summary && summary.winner || null,
        reason: summary && summary.reason || '',
        duration,
        totalFrames,
        balance: {
            damageDelta,
            damageDeltaRate: _rate(damageDelta, damageTotal),
            winnerDamageShare: summary && summary.winner === 'left' ? leftReport.damageShare : summary && summary.winner === 'right' ? rightReport.damageShare : 50,
        },
        left: leftReport,
        right: rightReport,
        warnings,
        suggestions,
    };
}

function _partialSummary(session, state, reason) {
    return {
        reason: reason || state.reason || 'manual_end',
        winner: state.winner || null,
        map: state.map,
        mapConfig: state.mapConfig,
        totalFrames: state.frame,
        duration: Math.ceil((state.frame || 0) / rules.BATTLE_FPS),
        left: {
            petId: session.unitA.petId,
            name: session.unitA.name,
            hpRemaining: Math.max(0, session.unitA.hp),
            personality: session.unitA.personality,
            personalityTrace: { ...session.unitA.personalityTrace },
            strategyTrace: { ...session.unitA.strategyTrace },
            opponentModel: { ...session.unitA.opponentModel, intentTrace: { ...(session.unitA.opponentModel && session.unitA.opponentModel.intentTrace || {}) } },
            hpMax: session.unitA.maxHp,
            bodyParts: state.units && state.units.left && state.units.left.body || {},
            impairments: { visionMult: session.unitA.visionMult, headTurnMult: session.unitA.headTurnMult, stepMult: session.unitA.stepMult, limbMoveMult: session.unitA.limbMoveMult, moveControl: session.unitA.moveControl, canUseSkills: session.unitA.canUseSkills },
            actionEconomy: { ...session.unitA.actionEconomy },
            infoStats: { ...session.unitA.infoStats },
            ...session.stats.left,
        },
        right: {
            petId: session.unitB.petId,
            name: session.unitB.name,
            hpRemaining: Math.max(0, session.unitB.hp),
            personality: session.unitB.personality,
            personalityTrace: { ...session.unitB.personalityTrace },
            strategyTrace: { ...session.unitB.strategyTrace },
            opponentModel: { ...session.unitB.opponentModel, intentTrace: { ...(session.unitB.opponentModel && session.unitB.opponentModel.intentTrace || {}) } },
            hpMax: session.unitB.maxHp,
            bodyParts: state.units && state.units.right && state.units.right.body || {},
            impairments: { visionMult: session.unitB.visionMult, headTurnMult: session.unitB.headTurnMult, stepMult: session.unitB.stepMult, limbMoveMult: session.unitB.limbMoveMult, moveControl: session.unitB.moveControl, canUseSkills: session.unitB.canUseSkills },
            actionEconomy: { ...session.unitB.actionEconomy },
            infoStats: { ...session.unitB.infoStats },
            ...session.stats.right,
        },
    };
}

function _saveDebugReport(sessionId, item, status, state) {
    if (!item || item.reportId) return item && item.reportId || null;
    const db = getDB();
    const finishedAt = Math.floor(Date.now() / 1000);
    const summary = state && state.summary || _partialSummary(item.session, state || battleEngine.getBattleState(item.session), status === 'manual_end' ? 'manual_end' : 'running');
    const frames = _compressFrames(item.session.frames || []);
    const analysis = _buildDebugAnalysis(summary, status);
    const info = db.prepare(`
        INSERT INTO battle_debug_report (
            session_id, pet1_id, pet2_id, map_id, left_personality, right_personality,
            status, winner, reason, frame_count, event_count, summary, analysis, frames,
            created_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        item.pet1Id,
        item.pet2Id,
        item.mapId,
        item.leftPersonality && item.leftPersonality.code || '',
        item.rightPersonality && item.rightPersonality.code || '',
        status,
        summary.winner || '',
        summary.reason || '',
        summary.totalFrames || 0,
        _countEvents(frames),
        _safeJson(summary),
        _safeJson(analysis),
        _safeJson(frames),
        Math.floor(item.createdAt / 1000),
        finishedAt
    );
    item.reportId = Number(info.lastInsertRowid);
    return item.reportId;
}

function _parseReport(row, withFrames) {
    if (!row) return null;
    const parsed = { ...row };
    parsed.summary = row.summary ? JSON.parse(row.summary) : null;
    parsed.analysis = row.analysis ? JSON.parse(row.analysis) : null;
    if (withFrames) parsed.frames = row.frames ? JSON.parse(row.frames) : [];
    else delete parsed.frames;
    return parsed;
}

function _sideReport(side, total) {
    return {
        avgDamage: Number((side.damage / total).toFixed(1)),
        avgHits: Number((side.hits / total).toFixed(1)),
        avgCrits: Number((side.crits / total).toFixed(1)),
        avgDodges: Number((side.dodges / total).toFixed(1)),
        avgSkills: Number((side.skills / total).toFixed(1)),
        avgHpLeft: Number((side.hpLeft / total).toFixed(1)),
        aiTraceAvg: _avgTrace(side.trace, total),
        strategyAvg: _avgStrategy(side.strategy, total),
        targetPartsAvg: _avgTargetParts(side.targetParts, total),
        targetTacticsAvg: _avgKeyed(side.targetTactics, total),
        infoAvg: _avgKeyed(side.infoStats, total),
        opponentModelAvg: {
            actions: Number(((side.opponentModel.actions || 0) / total).toFixed(1)),
            skills: Number(((side.opponentModel.skills || 0) / total).toFixed(1)),
            attacks: Number(((side.opponentModel.attacks || 0) / total).toFixed(1)),
            defenses: Number(((side.opponentModel.defenses || 0) / total).toFixed(1)),
            movement: Number(((side.opponentModel.movement || 0) / total).toFixed(1)),
            tricks: Number(((side.opponentModel.tricks || 0) / total).toFixed(1)),
            perceptions: Number(((side.opponentModel.perceptions || 0) / total).toFixed(1)),
            aggression: Number(((side.opponentModel.aggression || 0) / total).toFixed(3)),
            defense: Number(((side.opponentModel.defense || 0) / total).toFixed(3)),
            mobility: Number(((side.opponentModel.mobility || 0) / total).toFixed(3)),
            deception: Number(((side.opponentModel.deception || 0) / total).toFixed(3)),
            observation: Number(((side.opponentModel.observation || 0) / total).toFixed(3)),
            intentTraceAvg: _avgStrategy(side.opponentModel.intentTrace, total),
            lastIntent: side.opponentModel.lastIntent || 'idle',
            lastSkill: side.opponentModel.lastSkill || null,
        },
        avgBlocks: Number(((side.blocks || 0) / total).toFixed(1)),
        avgBlockedDamage: Number(((side.blockedDamage || 0) / total).toFixed(1)),
        avgCounters: Number(((side.counters || 0) / total).toFixed(1)),
        avgStaminaSpent: Number(((side.staminaSpent || 0) / total).toFixed(1)),
        avgStaminaBlocked: Number(((side.staminaBlocked || 0) / total).toFixed(1)),
        angle: _angleReport(side.angle)
    };
}

function previewPets({ pet1Id, pet2Id }) {
    const left = _loadFighter(pet1Id, '左方');
    if (!left.ok) return { code: 8020, msg: left.msg };
    const right = _loadFighter(pet2Id, '右方');
    if (!right.ok) return { code: 8020, msg: right.msg };
    return { code: 0, data: { appearance: { left: left.appearance, right: right.appearance } } };
}

function startBattle({ pet1Id, pet2Id, mapId, leftPersonality, rightPersonality, randomPersonality }) {
    _cleanup();
    const left = _loadFighter(pet1Id, '左方');
    if (!left.ok) return { code: 8020, msg: left.msg };

    const right = _loadFighter(pet2Id, '右方');
    if (!right.ok) return { code: 8020, msg: right.msg };

    const leftAi = _resolvePersonality(leftPersonality, randomPersonality);
    const rightAi = _resolvePersonality(rightPersonality, randomPersonality);
    const session = battleEngine.createBattle({ pet1: left.fighter, pet2: right.fighter, mapId: mapId || 'grassland', leftPersonality: leftAi, rightPersonality: rightAi });
    const id = _sessionId();
    const state = battleEngine.getBattleState(session);
    sessions.set(id, { session, createdAt: Date.now(), updatedAt: Date.now(), pet1Id: left.fighter.id, pet2Id: right.fighter.id, mapId: mapId || 'grassland', leftPersonality: leftAi, rightPersonality: rightAi });
    return { code: 0, data: { sessionId: id, state, appearance: { left: left.appearance, right: right.appearance }, personalities: { left: leftAi, right: rightAi } } };
}

function stepBattle(sessionId, frames = 1) {
    const item = sessions.get(sessionId);
    if (!item) return { code: 8040, msg: '战斗调试会话不存在或已过期' };
    item.updatedAt = Date.now();
    const state = battleEngine.stepBattle(item.session, frames, { recordFrames: true });
    let reportId = item.reportId || null;
    if (state.finished) {
        reportId = _saveDebugReport(sessionId, item, 'finished', state);
        sessions.delete(sessionId);
    }
    return { code: 0, data: { sessionId, state, reportId } };
}

function resetBattle(sessionId) {
    const item = sessions.get(sessionId);
    if (!item) return { code: 8040, msg: '战斗调试会话不存在或已过期' };
    const old = item;
    const state = battleEngine.getBattleState(old.session);
    const reportId = _saveDebugReport(sessionId, old, 'reset', state);
    sessions.delete(sessionId);
    const next = startBattle({ pet1Id: old.pet1Id, pet2Id: old.pet2Id, mapId: old.mapId || old.session.map.id, leftPersonality: old.leftPersonality, rightPersonality: old.rightPersonality });
    if (next.code === 0) next.data.previousReportId = reportId;
    return next;
}

function endBattle(sessionId) {
    const item = sessions.get(sessionId);
    if (!item) return { code: 8040, msg: '战斗调试会话不存在或已过期' };
    const state = battleEngine.getBattleState(item.session);
    const reportId = _saveDebugReport(sessionId, item, state.finished ? 'finished' : 'manual_end', state);
    sessions.delete(sessionId);
    return { code: 0, data: { reportId }, msg: '调试会话已结束，报告已保存' };
}

function batchTest({ pet1Id, pet2Id, mapId, count, leftPersonality, rightPersonality, randomPersonality }) {
    const left = _loadFighter(pet1Id, '左方');
    if (!left.ok) return { code: 8020, msg: left.msg };

    const right = _loadFighter(pet2Id, '右方');
    if (!right.ok) return { code: 8020, msg: right.msg };

    const pet1 = left.fighter;
    const pet2 = right.fighter;
    const total = Math.max(1, Math.min(200, Math.floor(count || 20)));
    const fixedLeftAi = randomPersonality ? null : _resolvePersonality(leftPersonality, false);
    const fixedRightAi = randomPersonality ? null : _resolvePersonality(rightPersonality, false);
    const stat = {
        count: total,
        left: 0,
        right: 0,
        draw: 0,
        avgDuration: 0,
        avgDamageLeft: 0,
        avgDamageRight: 0,
        avgDodgesLeft: 0,
        avgDodgesRight: 0,
        leftPersonality: fixedLeftAi || { code: 'random', name: '随机性格' },
        rightPersonality: fixedRightAi || { code: 'random', name: '随机性格' },
        detail: {
            left: { damage: 0, hits: 0, crits: 0, dodges: 0, skills: 0, hpLeft: 0, trace: {}, strategy: {}, blocks: 0, blockedDamage: 0, counters: 0, staminaSpent: 0, staminaBlocked: 0, angle: _emptyAngleStats(), targetParts: {}, targetTactics: {}, infoStats: {}, opponentModel: { intentTrace: {} } },
            right: { damage: 0, hits: 0, crits: 0, dodges: 0, skills: 0, hpLeft: 0, trace: {}, strategy: {}, blocks: 0, blockedDamage: 0, counters: 0, staminaSpent: 0, staminaBlocked: 0, angle: _emptyAngleStats(), targetParts: {}, targetTactics: {}, infoStats: {}, opponentModel: { intentTrace: {} } },
            samples: []
        }
    };

    for (let i = 0; i < total; i++) {
        const leftAi = fixedLeftAi || _resolvePersonality('random', true);
        const rightAi = fixedRightAi || _resolvePersonality('random', true);
        const result = battleEngine.simulate({ pet1, pet2, mapId: mapId || 'grassland', leftPersonality: leftAi, rightPersonality: rightAi });
        stat[result.winner]++;
        stat.avgDuration += result.summary.duration;
        stat.avgDamageLeft += result.summary.left.totalDamage;
        stat.avgDamageRight += result.summary.right.totalDamage;
        stat.avgDodgesLeft += result.summary.left.dodges;
        stat.avgDodgesRight += result.summary.right.dodges;
        stat.detail.left.damage += result.summary.left.totalDamage;
        stat.detail.right.damage += result.summary.right.totalDamage;
        stat.detail.left.hits += result.summary.left.hits;
        stat.detail.right.hits += result.summary.right.hits;
        stat.detail.left.crits += result.summary.left.crits;
        stat.detail.right.crits += result.summary.right.crits;
        stat.detail.left.dodges += result.summary.left.dodges;
        stat.detail.right.dodges += result.summary.right.dodges;
        stat.detail.left.skills += result.summary.left.skillsUsed;
        stat.detail.right.skills += result.summary.right.skillsUsed;
        stat.detail.left.blocks += result.summary.left.blocks || 0;
        stat.detail.right.blocks += result.summary.right.blocks || 0;
        stat.detail.left.blockedDamage += result.summary.left.blockedDamage || 0;
        stat.detail.right.blockedDamage += result.summary.right.blockedDamage || 0;
        stat.detail.left.counters += result.summary.left.counters || 0;
        stat.detail.right.counters += result.summary.right.counters || 0;
        stat.detail.left.staminaSpent += result.summary.left.actionEconomy && result.summary.left.actionEconomy.spent || 0;
        stat.detail.right.staminaSpent += result.summary.right.actionEconomy && result.summary.right.actionEconomy.spent || 0;
        stat.detail.left.staminaBlocked += result.summary.left.actionEconomy && result.summary.left.actionEconomy.blockedByStamina || 0;
        stat.detail.right.staminaBlocked += result.summary.right.actionEconomy && result.summary.right.actionEconomy.blockedByStamina || 0;
        stat.detail.left.hpLeft += result.summary.left.hpRemaining;
        stat.detail.right.hpLeft += result.summary.right.hpRemaining;
        _addTrace(stat.detail.left.trace, result.summary.left.personalityTrace);
        _addTrace(stat.detail.right.trace, result.summary.right.personalityTrace);
        _addStrategy(stat.detail.left.strategy, result.summary.left.strategyTrace || result.summary.left.strategy);
        _addStrategy(stat.detail.right.strategy, result.summary.right.strategyTrace || result.summary.right.strategy);
        _addTargetParts(stat.detail.left.targetParts, result.summary.left.targetParts);
        _addTargetParts(stat.detail.right.targetParts, result.summary.right.targetParts);
        _addKeyed(stat.detail.left.targetTactics, result.summary.left.targetTactics);
        _addKeyed(stat.detail.right.targetTactics, result.summary.right.targetTactics);
        _addInfoStats(stat.detail.left.infoStats, result.summary.left.infoStats);
        _addInfoStats(stat.detail.right.infoStats, result.summary.right.infoStats);
        _addOpponentModel(stat.detail.left.opponentModel, result.summary.left.opponentModel);
        _addOpponentModel(stat.detail.right.opponentModel, result.summary.right.opponentModel);
        _addAngleStats(stat.detail.left.angle, result.summary.left.angle);
        _addAngleStats(stat.detail.right.angle, result.summary.right.angle);
        if (stat.detail.samples.length < 8) {
            stat.detail.samples.push({ index: i + 1, winner: result.winner, duration: result.summary.duration, leftDamage: result.summary.left.totalDamage, rightDamage: result.summary.right.totalDamage, leftAi: leftAi.name, rightAi: rightAi.name });
        }
    }
    stat.avgDuration = Number((stat.avgDuration / total).toFixed(1));
    stat.avgDamageLeft = Number((stat.avgDamageLeft / total).toFixed(1));
    stat.avgDamageRight = Number((stat.avgDamageRight / total).toFixed(1));
    stat.avgDodgesLeft = Number((stat.avgDodgesLeft / total).toFixed(1));
    stat.avgDodgesRight = Number((stat.avgDodgesRight / total).toFixed(1));
    stat.leftRate = _rate(stat.left, total);
    stat.rightRate = _rate(stat.right, total);
    stat.drawRate = _rate(stat.draw, total);
    stat.detail.left = _sideReport(stat.detail.left, total);
    stat.detail.right = _sideReport(stat.detail.right, total);
    return { code: 0, data: stat };
}

function listReports(limit = 20) {
    const db = getDB();
    const n = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const rows = db.prepare(`
        SELECT id, session_id, pet1_id, pet2_id, map_id, left_personality, right_personality,
               status, winner, reason, frame_count, event_count, summary, analysis, created_at, finished_at
        FROM battle_debug_report
        ORDER BY finished_at DESC, id DESC
        LIMIT ?
    `).all(n);
    return { code: 0, data: { reports: rows.map(row => _parseReport(row, false)) } };
}

function getReport(id) {
    const reportId = Math.floor(Number(id) || 0);
    if (reportId <= 0) return { code: 8050, msg: '调试报告ID无效' };
    const db = getDB();
    const row = db.prepare('SELECT * FROM battle_debug_report WHERE id = ?').get(reportId);
    if (!row) return { code: 8051, msg: '调试报告不存在' };
    return { code: 0, data: { report: _parseReport(row, true) } };
}

function getLatestReport() {
    const db = getDB();
    const row = db.prepare('SELECT * FROM battle_debug_report ORDER BY finished_at DESC, id DESC LIMIT 1').get();
    if (!row) return { code: 8051, msg: '暂无调试战斗报告' };
    return { code: 0, data: { report: _parseReport(row, true) } };
}

module.exports = { listMaps, previewPets, startBattle, stepBattle, resetBattle, endBattle, batchTest, listReports, getReport, getLatestReport };
