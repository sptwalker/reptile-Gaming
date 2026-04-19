/**
 * 宠物蛋路由
 * POST /api/egg/claim 🔒 — 领取初始蛋
 * POST /api/egg/list  🔒 — 查询蛋列表
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const eggService            = require('../services/egg-service');

const router = Router();

/**
 * POST /api/egg/claim
 * 限流：同用户 30次/分钟（默认）
 */
router.post('/claim',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const result = eggService.claimEgg(req.uid, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/egg/list
 */
router.post('/list', (req, res) => {
    const result = eggService.listEggs(req.uid);
    ok(res, result.data);
});

module.exports = router;
