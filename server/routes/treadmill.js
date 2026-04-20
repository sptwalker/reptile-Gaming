/**
 * 跑道路由 (P7)
 * POST /api/treadmill/status  🔒 — 查询跑道状态
 * POST /api/treadmill/install 🔒 — 安装/升级跑道
 * POST /api/treadmill/start   🔒 — 启动跑步
 * POST /api/treadmill/collect  🔒 — 收集产出金币
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');
const treadmillService      = require('../services/treadmill-service');

const router = Router();

/**
 * POST /api/treadmill/status
 */
router.post('/status',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = treadmillService.getStatus(req.uid, pet_id);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

/**
 * POST /api/treadmill/install
 */
router.post('/install',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    (req, res) => {
        const { pet_id, tier } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        if (!isValidInt(tier, 1, 4)) {
            return fail(res, 1001, 'tier 参数错误（1~4）');
        }
        const result = treadmillService.install(req.uid, pet_id, tier, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg, result.data);
        ok(res, result.data);
    }
);

/**
 * POST /api/treadmill/start
 */
router.post('/start',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = treadmillService.startRun(req.uid, pet_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

/**
 * POST /api/treadmill/collect
 */
router.post('/collect',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = treadmillService.collect(req.uid, pet_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

module.exports = router;
