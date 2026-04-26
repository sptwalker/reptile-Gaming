/**
 * 战斗调试服务
 * - 仅用于测试模块实时战斗数值验证
 * - 使用内存会话，不写入正式战斗记录
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

function _sideReport(side, total) {
    return {
        avgDamage: Number((side.damage / total).toFixed(1)),
        avgHits: Number((side.hits / total).toFixed(1)),
        avgCrits: Number((side.crits / total).toFixed(1)),
        avgDodges: Number((side.dodges / total).toFixed(1)),
        avgSkills: Number((side.skills / total).toFixed(1)),
        avgHpLeft: Number((side.hpLeft / total).toFixed(1)),
        aiTraceAvg: _avgTrace(side.trace, total),
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
    const state = battleEngine.stepBattle(item.session, frames, { recordFrames: false });
    return { code: 0, data: { sessionId, state } };
}

function resetBattle(sessionId) {
    const item = sessions.get(sessionId);
    if (!item) return { code: 8040, msg: '战斗调试会话不存在或已过期' };
    const old = item;
    sessions.delete(sessionId);
    return startBattle({ pet1Id: old.pet1Id, pet2Id: old.pet2Id, mapId: old.mapId || old.session.map.id, leftPersonality: old.leftPersonality, rightPersonality: old.rightPersonality });
}

function endBattle(sessionId) {
    sessions.delete(sessionId);
    return { code: 0, data: null, msg: '调试会话已结束' };
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
            left: { damage: 0, hits: 0, crits: 0, dodges: 0, skills: 0, hpLeft: 0, trace: {}, angle: _emptyAngleStats() },
            right: { damage: 0, hits: 0, crits: 0, dodges: 0, skills: 0, hpLeft: 0, trace: {}, angle: _emptyAngleStats() },
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
        stat.detail.left.hpLeft += result.summary.left.hpRemaining;
        stat.detail.right.hpLeft += result.summary.right.hpRemaining;
        _addTrace(stat.detail.left.trace, result.summary.left.personalityTrace);
        _addTrace(stat.detail.right.trace, result.summary.right.personalityTrace);
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

module.exports = { listMaps, previewPets, startBattle, stepBattle, resetBattle, endBattle, batchTest };
