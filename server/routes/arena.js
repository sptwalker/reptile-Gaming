/**
 * 竞技场路由 (P9)
 * POST /api/arena/enter       🔒 — 入场
 * POST /api/arena/my           🔒 — 我的竞技场宠物
 * POST /api/arena/opponents    🔒 — 对手列表
 * POST /api/arena/collect      🔒 — 提取存钱罐
 * POST /api/arena/challenge    🔒 — 发起挑战
 * POST /api/arena/battle       🔒 — 执行战斗
 * POST /api/arena/history      🔒 — 战斗记录
 * POST /api/arena/replay       🔒 — 战斗回放
 * POST /api/arena/live         🔒 — 观战列表
 * POST /api/arena/admin-test   🔒 — 管理员测试
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');
const arenaService          = require('../services/arena-service');

const router = Router();

/* ── 统一异常包装 ── */
function wrap(handler) {
    return (req, res) => {
        try {
            handler(req, res);
        } catch (err) {
            console.error(`[Arena] ${req.path}`, err.message || err);
            fail(res, 9999, '竞技场服务异常，请稍后重试');
        }
    };
}

/* ── 入场 ── */
router.post('/enter',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    wrap((req, res) => {
        const { pet_id } = req.body;
        if (!isValidInt(pet_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.enterArena(req.uid, Number(pet_id), req.ip);
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 我的竞技场 ── */
router.post('/my',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    wrap((req, res) => {
        const result = arenaService.getMyArena(req.uid);
        ok(res, result.data, result.msg);
    })
);

/* ── 对手列表 ── */
router.post('/opponents',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    wrap((req, res) => {
        const { pet_id } = req.body;
        if (!isValidInt(pet_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.listOpponents(req.uid, Number(pet_id));
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 提取存钱罐 ── */
router.post('/collect',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    wrap((req, res) => {
        const { pet_id } = req.body;
        if (!isValidInt(pet_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.collectGold(req.uid, Number(pet_id), req.ip);
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 发起挑战 ── */
router.post('/challenge',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    wrap((req, res) => {
        const { pet_id, target_pet_id } = req.body;
        if (!isValidInt(pet_id) || !isValidInt(target_pet_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.challenge(req.uid, Number(pet_id), Number(target_pet_id), req.ip);
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 执行战斗 ── */
router.post('/battle',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    wrap((req, res) => {
        const { challenge_id } = req.body;
        if (!isValidInt(challenge_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.executeBattle(Number(challenge_id), req.ip);
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 战斗记录 ── */
router.post('/history',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    wrap((req, res) => {
        const result = arenaService.getBattleHistory(req.uid);
        ok(res, result.data, result.msg);
    })
);

/* ── 战斗回放 ── */
router.post('/replay',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    wrap((req, res) => {
        const { challenge_id } = req.body;
        if (!isValidInt(challenge_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.getBattleReplay(Number(challenge_id));
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

/* ── 观战列表 ── */
router.post('/live',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    wrap((req, res) => {
        const result = arenaService.getLiveBattles();
        ok(res, result.data, result.msg);
    })
);

/* ── 管理员测试 ── */
router.post('/admin-test',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    wrap((req, res) => {
        const { pet1_id, pet2_id } = req.body;
        if (!isValidInt(pet1_id) || !isValidInt(pet2_id)) return fail(res, 4000, '参数错误');
        const result = arenaService.adminTestBattle(req.uid, Number(pet1_id), Number(pet2_id), req.ip);
        result.code === 0 ? ok(res, result.data, result.msg) : fail(res, result.code, result.msg);
    })
);

module.exports = router;
