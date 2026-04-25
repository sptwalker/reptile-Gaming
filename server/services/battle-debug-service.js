/**
 * 战斗调试服务
 * - 仅用于测试模块实时战斗数值验证
 * - 使用内存会话，不写入正式战斗记录
 */

'use strict';

const crypto = require('crypto');
const { getDB } = require('../db');
const battleEngine = require('./battle-engine');
const rules = require('../models/game-rules');

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
        }
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
    return { code: 0, data: { maps: rules.ARENA_MAPS, bodyParts: rules.BATTLE_BODY_PARTS } };
}

function startBattle({ pet1Id, pet2Id, mapId }) {
    _cleanup();
    const left = _loadFighter(pet1Id, '左方');
    if (!left.ok) return { code: 8020, msg: left.msg };

    const right = _loadFighter(pet2Id, '右方');
    if (!right.ok) return { code: 8020, msg: right.msg };

    const session = battleEngine.createBattle({ pet1: left.fighter, pet2: right.fighter, mapId: mapId || 'grassland' });
    const id = _sessionId();
    const state = battleEngine.getBattleState(session);
    sessions.set(id, { session, createdAt: Date.now(), updatedAt: Date.now(), pet1Id: left.fighter.id, pet2Id: right.fighter.id });
    return { code: 0, data: { sessionId: id, state } };
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
    return startBattle({ pet1Id: old.pet1Id, pet2Id: old.pet2Id, mapId: old.session.map.id });
}

function endBattle(sessionId) {
    sessions.delete(sessionId);
    return { code: 0, data: null, msg: '调试会话已结束' };
}

function batchTest({ pet1Id, pet2Id, mapId, count }) {
    const left = _loadFighter(pet1Id, '左方');
    if (!left.ok) return { code: 8020, msg: left.msg };

    const right = _loadFighter(pet2Id, '右方');
    if (!right.ok) return { code: 8020, msg: right.msg };

    const pet1 = left.fighter;
    const pet2 = right.fighter;
    const total = Math.max(1, Math.min(200, Math.floor(count || 20)));
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
    };

    for (let i = 0; i < total; i++) {
        const result = battleEngine.simulate({ pet1, pet2, mapId: mapId || 'grassland' });
        stat[result.winner]++;
        stat.avgDuration += result.summary.duration;
        stat.avgDamageLeft += result.summary.left.totalDamage;
        stat.avgDamageRight += result.summary.right.totalDamage;
        stat.avgDodgesLeft += result.summary.left.dodges;
        stat.avgDodgesRight += result.summary.right.dodges;
    }
    stat.avgDuration = Number((stat.avgDuration / total).toFixed(1));
    stat.avgDamageLeft = Number((stat.avgDamageLeft / total).toFixed(1));
    stat.avgDamageRight = Number((stat.avgDamageRight / total).toFixed(1));
    stat.avgDodgesLeft = Number((stat.avgDodgesLeft / total).toFixed(1));
    stat.avgDodgesRight = Number((stat.avgDodgesRight / total).toFixed(1));
    stat.leftRate = Number((stat.left / total * 100).toFixed(1));
    stat.rightRate = Number((stat.right / total * 100).toFixed(1));
    stat.drawRate = Number((stat.draw / total * 100).toFixed(1));
    return { code: 0, data: stat };
}

module.exports = { listMaps, startBattle, stepBattle, resetBattle, endBattle, batchTest };
