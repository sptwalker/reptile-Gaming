/**
 * 战斗调试路由
 */

'use strict';

const router = require('express').Router();
const { ok, fail } = require('../utils/response');
const debug = require('../services/battle-debug-service');

function wrap(handler) {
    return (req, res) => {
        try {
            handler(req, res);
        } catch (err) {
            console.error(`[BattleDebug] ${req.path}`, err.message || err);
            fail(res, 9999, '战斗调试服务异常');
        }
    };
}

router.get('/meta', wrap((_req, res) => {
    const result = debug.listMaps();
    ok(res, result.data, result.msg);
}));

router.post('/preview', wrap((req, res) => {
    const { pet1Id, pet2Id } = req.body;
    if (!pet1Id || !pet2Id) return fail(res, 8023, '需要两只宠物ID');
    const result = debug.previewPets({ pet1Id: Number(pet1Id), pet2Id: Number(pet2Id) });
    result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
}));

router.post('/start', wrap((req, res) => {
    const { pet1Id, pet2Id, mapId, leftPersonality, rightPersonality, randomPersonality } = req.body;
    if (!pet1Id || !pet2Id) return fail(res, 8023, '需要两只宠物ID');
    const result = debug.startBattle({ pet1Id: Number(pet1Id), pet2Id: Number(pet2Id), mapId, leftPersonality, rightPersonality, randomPersonality });
    result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
}));

router.post('/step', wrap((req, res) => {
    const { sessionId, frames } = req.body;
    if (!sessionId) return fail(res, 8040, '需要调试会话ID');
    const result = debug.stepBattle(sessionId, Number(frames || 1));
    result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
}));

router.post('/reset', wrap((req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return fail(res, 8040, '需要调试会话ID');
    const result = debug.resetBattle(sessionId);
    result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
}));

router.post('/end', wrap((req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return fail(res, 8040, '需要调试会话ID');
    const result = debug.endBattle(sessionId);
    ok(res, result.data, result.msg);
}));

router.post('/batch', wrap((req, res) => {
    const { pet1Id, pet2Id, mapId, count, leftPersonality, rightPersonality, randomPersonality } = req.body;
    if (!pet1Id || !pet2Id) return fail(res, 8023, '需要两只宠物ID');
    const result = debug.batchTest({ pet1Id: Number(pet1Id), pet2Id: Number(pet2Id), mapId, count: Number(count || 20), leftPersonality, rightPersonality, randomPersonality });
    result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
}));

module.exports = router;
